
from flask import (
    Flask, jsonify, request, render_template,
    session, redirect, send_file
)
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from pathlib import Path
from datetime import date, datetime
from collections import defaultdict
from io import BytesIO, StringIO
import sqlite3
import csv
import os

app = Flask(__name__)
app.secret_key = os.environ.get(
    "FINTRACK_SECRET_KEY", "chave-local-troque-antes-de-publicar"
)
DB_PATH = Path(__file__).with_name("fintrack.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
                description TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount > 0),
                kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')),
                category TEXT NOT NULL,
                transaction_date TEXT NOT NULL
            )
        """)

        # Atualiza bancos antigos que ainda não possuem user_id.
        columns = [
            row["name"]
            for row in conn.execute("PRAGMA table_info(transactions)")
        ]
        if "user_id" not in columns:
            conn.execute(
                "ALTER TABLE transactions ADD COLUMN user_id INTEGER"
            )

        conn.execute("""
            CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                title TEXT NOT NULL,
                target REAL NOT NULL CHECK(target > 0),
                saved REAL NOT NULL DEFAULT 0 CHECK(saved >= 0),
                deadline TEXT
            )
        """)

        conn.commit()


def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Faça login para continuar."}), 401
        return function(*args, **kwargs)
    return wrapper


@app.route("/")
def home():
    if "user_id" not in session:
        return redirect("/login")
    return render_template("index.html")


@app.route("/login")
def login_page():
    if "user_id" in session:
        return redirect("/")
    return render_template("login.html")


@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not name or not email or len(password) < 8:
        return jsonify({
            "error": "Informe nome, e-mail e senha com pelo menos 8 caracteres."
        }), 400

    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                (name, email, generate_password_hash(password))
            )
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Este e-mail já está cadastrado."}), 409

    return jsonify({"message": "Conta criada com sucesso."}), 201


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    with get_db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "E-mail ou senha incorretos."}), 401

    session.clear()
    session["user_id"] = user["id"]
    session["user_name"] = user["name"]
    return jsonify({"message": "Login realizado.", "name": user["name"]})


@app.route("/logout", methods=["GET"])
def logout():
    session.clear()
    return redirect("/login")



@app.get("/api/me")
@login_required
def me():
    return jsonify({"name": session.get("user_name")})


@app.get("/api/transactions")
@login_required
def list_transactions():
    conditions = ["user_id = ?"]
    params = [session["user_id"]]

    category = request.args.get("category", "").strip()
    start = request.args.get("start", "").strip()
    end = request.args.get("end", "").strip()
    month = request.args.get("month", "").strip()
    kind = request.args.get("kind", "").strip()

    if category:
        conditions.append("category = ?")
        params.append(category)

    if start:
        conditions.append("transaction_date >= ?")
        params.append(start)

    if end:
        conditions.append("transaction_date <= ?")
        params.append(end)

    if month:
        conditions.append("substr(transaction_date, 1, 7) = ?")
        params.append(month)

    if kind in ("income", "expense"):
        conditions.append("kind = ?")
        params.append(kind)

    sql = (
        "SELECT id, description, amount, kind, category, transaction_date "
        "FROM transactions WHERE " + " AND ".join(conditions) +
        " ORDER BY transaction_date DESC, id DESC"
    )

    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()

    return jsonify([dict(row) for row in rows])


@app.post("/api/transactions")
@login_required
def create_transaction():
    data = request.get_json(silent=True) or {}
    description = str(data.get("description", "")).strip()
    category = str(data.get("category", "")).strip()
    kind = data.get("kind")
    transaction_date = str(data.get("transaction_date", ""))

    try:
        amount = float(data.get("amount", 0))
        datetime.strptime(transaction_date, "%Y-%m-%d")
    except (TypeError, ValueError):
        return jsonify({"error": "Valor ou data inválidos."}), 400

    if not description or not category:
        return jsonify({"error": "Preencha todos os campos."}), 400

    if kind not in ("income", "expense") or amount <= 0:
        return jsonify({"error": "Tipo ou valor inválido."}), 400

    with get_db() as conn:
        cursor = conn.execute("""
            INSERT INTO transactions
            (user_id, description, amount, kind, category, transaction_date)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            session["user_id"], description, amount, kind,
            category, transaction_date
        ))
        conn.commit()

        row = conn.execute(
            "SELECT id, description, amount, kind, category, transaction_date "
            "FROM transactions WHERE id = ? AND user_id = ?",
            (cursor.lastrowid, session["user_id"])
        ).fetchone()

    return jsonify(dict(row)), 201


@app.delete("/api/transactions/<int:transaction_id>")
@login_required
def delete_transaction(transaction_id):
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM transactions WHERE id = ? AND user_id = ?",
            (transaction_id, session["user_id"])
        )
        conn.commit()

    if cursor.rowcount == 0:
        return jsonify({"error": "Transação não encontrada."}), 404

    return jsonify({"message": "Transação excluída."})


@app.get("/api/summary")
@login_required
def summary():
    month = request.args.get("month", date.today().strftime("%Y-%m"))

    try:
        datetime.strptime(month, "%Y-%m")
    except ValueError:
        return jsonify({"error": "Mês inválido."}), 400

    user_id = session["user_id"]

    with get_db() as conn:
        rows = conn.execute("""
            SELECT kind, amount, category
            FROM transactions
            WHERE user_id = ? AND substr(transaction_date, 1, 7) = ?
        """, (user_id, month)).fetchall()

        historical = conn.execute("""
            SELECT substr(transaction_date, 1, 7) AS month,
                   SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END) AS income,
                   SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END) AS expenses
            FROM transactions
            WHERE user_id = ?
            GROUP BY substr(transaction_date, 1, 7)
            ORDER BY month
        """, (user_id,)).fetchall()

    income = sum(r["amount"] for r in rows if r["kind"] == "income")
    expenses = sum(r["amount"] for r in rows if r["kind"] == "expense")

    categories = defaultdict(float)
    for row in rows:
        if row["kind"] == "expense":
            categories[row["category"]] += row["amount"]

    history = [dict(r) for r in historical]
    past_expenses = [
        float(r["expenses"] or 0)
        for r in history
        if r["month"] < month
    ][-3:]

    forecast = round(sum(past_expenses) / len(past_expenses), 2) if past_expenses else 0

    previous = next(
        (r for r in history if r["month"] == previous_month(month)), None
    )

    return jsonify({
        "month": month,
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "balance": round(income - expenses, 2),
        "categories": dict(categories),
        "forecast": forecast,
        "forecast_months_used": len(past_expenses),
        "previous_month": previous_month(month),
        "previous_income": round(float(previous["income"] or 0), 2) if previous else 0,
        "previous_expenses": round(float(previous["expenses"] or 0), 2) if previous else 0,
        "history": history
    })


def previous_month(month):
    current = datetime.strptime(month + "-01", "%Y-%m-%d")
    if current.month == 1:
        return f"{current.year - 1}-12"
    return f"{current.year}-{current.month - 1:02d}"


@app.get("/api/export/<format>")
@login_required
def export_transactions(format):
    if format not in ("csv", "xlsx"):
        return jsonify({"error": "Formato inválido. Use csv ou xlsx."}), 400

    with get_db() as conn:
        rows = conn.execute("""
            SELECT description, amount, kind, category, transaction_date
            FROM transactions
            WHERE user_id = ?
            ORDER BY transaction_date DESC
        """, (session["user_id"],)).fetchall()

    headers = ["Descrição", "Valor", "Tipo", "Categoria", "Data"]

    if format == "csv":
        output = StringIO()
        writer = csv.writer(output, delimiter=";")
        writer.writerow(headers)
        for row in rows:
            writer.writerow(list(row))

        memory_file = BytesIO(output.getvalue().encode("utf-8-sig"))
        return send_file(
            memory_file, mimetype="text/csv",
            as_attachment=True, download_name="fintrack_transacoes.csv"
        )

    try:
        from openpyxl import Workbook
    except ImportError:
        return jsonify({
            "error": "Para exportar Excel, instale a dependência openpyxl."
        }), 500

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Transações"
    sheet.append(headers)

    for row in rows:
        sheet.append(list(row))

    memory_file = BytesIO()
    workbook.save(memory_file)
    memory_file.seek(0)

    return send_file(
        memory_file,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="fintrack_transacoes.xlsx"
    )


@app.get("/api/goals")
@login_required
def list_goals():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id = ? ORDER BY id DESC",
            (session["user_id"],)
        ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.post("/api/goals")
@login_required
def create_goal():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()
    deadline = str(data.get("deadline", "")).strip() or None

    try:
        target = float(data.get("target", 0))
        saved = float(data.get("saved", 0))
        if deadline:
            datetime.strptime(deadline, "%Y-%m-%d")
    except (TypeError, ValueError):
        return jsonify({"error": "Confira os valores e a data da meta."}), 400

    if not title or target <= 0 or saved < 0:
        return jsonify({"error": "Informe um título e valores válidos."}), 400

    with get_db() as conn:
        cursor = conn.execute("""
            INSERT INTO goals (user_id, title, target, saved, deadline)
            VALUES (?, ?, ?, ?, ?)
        """, (session["user_id"], title, target, saved, deadline))
        conn.commit()

        goal = conn.execute(
            "SELECT * FROM goals WHERE id = ? AND user_id = ?",
            (cursor.lastrowid, session["user_id"])
        ).fetchone()

    return jsonify(dict(goal)), 201


@app.patch("/api/goals/<int:goal_id>")
@login_required
def update_goal(goal_id):
    data = request.get_json(silent=True) or {}

    try:
        saved = float(data.get("saved", -1))
    except (TypeError, ValueError):
        return jsonify({"error": "Valor inválido."}), 400

    if saved < 0:
        return jsonify({"error": "O valor guardado não pode ser negativo."}), 400

    with get_db() as conn:
        cursor = conn.execute(
            "UPDATE goals SET saved = ? WHERE id = ? AND user_id = ?",
            (saved, goal_id, session["user_id"])
        )
        conn.commit()

    if cursor.rowcount == 0:
        return jsonify({"error": "Meta não encontrada."}), 404

    return jsonify({"message": "Meta atualizada."})


@app.delete("/api/goals/<int:goal_id>")
@login_required
def delete_goal(goal_id):
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM goals WHERE id = ? AND user_id = ?",
            (goal_id, session["user_id"])
        )
        conn.commit()

    if cursor.rowcount == 0:
        return jsonify({"error": "Meta não encontrada."}), 404

    return jsonify({"message": "Meta excluída."})


init_db()

if __name__ == "__main__":
    app.run(debug=True)