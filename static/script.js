
/* =========================================
   FINTRACK — JAVASCRIPT PRINCIPAL
   Dashboard, transações, gráficos e metas
========================================= */

// FORMATAÇÃO DE VALORES
const money = value => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
}).format(Number(value || 0));

const $ = selector => document.querySelector(selector);
const byId = id => document.getElementById(id);

// ELEMENTOS DO DASHBOARD
const monthFilter = byId("monthFilter");
const categoryFilter = byId("categoryFilter");
const startDateFilter = byId("startDateFilter");
const endDateFilter = byId("endDateFilter");
const clearFiltersBtn = byId("clearFiltersBtn");

const exportCsvBtn = byId("exportCsvBtn");
const exportExcelBtn = byId("exportExcelBtn");

const dialog = byId("transactionDialog");
const form = byId("transactionForm");
const formError = byId("formError");
const transactionsBody = byId("transactionsBody");
const emptyState = byId("emptyState");
const chartEmpty = byId("chartEmpty");

let categoryChart = null;
let monthlyChart = null;

let allTransactions = [];
let visibleTransactions = [];

let dashboardRequest = 0;

// DATA LOCAL
const today = new Date();

const localDate = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0")
].join("-");

if (monthFilter) {
  monthFilter.value = localDate.slice(0, 7);
}

if (byId("transactionDate")) {
  byId("transactionDate").value = localDate;
}

// =========================================
// NOTIFICAÇÕES
// =========================================

function showToast(message) {
  const toast = byId("toast");

  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timeout);

  showToast.timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

// =========================================
// COMUNICAÇÃO COM A API
// =========================================

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "Content-Type": "application/json"
    }
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.error ||
      result.message ||
      "Não foi possível concluir a operação."
    );
  }

  return result;
}

// =========================================
// SEGURANÇA E FORMATAÇÃO
// =========================================

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function dateLabel(value) {
  if (!value) return "";

  const parts = String(value).split("-");

  if (parts.length !== 3) return value;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// =========================================
// MODAL DE TRANSAÇÕES
// =========================================

function openDialog() {
  if (!dialog || !form) return;

  formError.textContent = "";
  form.reset();

  byId("transactionDialogTitle").textContent =
    "Adicionar transação";

  byId("transactionDate").value = localDate;
  dialog.showModal();
}

function closeDialog() {
  if (dialog?.open) {
    dialog.close();
  }

  if (formError) {
    formError.textContent = "";
  }
}

byId("newTransactionBtn")?.addEventListener("click", openDialog);
byId("emptyAddBtn")?.addEventListener("click", openDialog);
byId("closeDialog")?.addEventListener("click", closeDialog);
byId("cancelDialog")?.addEventListener("click", closeDialog);

// =========================================
// FILTROS
// =========================================

monthFilter?.addEventListener("change", refreshDashboard);

categoryFilter?.addEventListener(
  "change",
  refreshFilteredTransactions
);

startDateFilter?.addEventListener(
  "change",
  refreshFilteredTransactions
);

endDateFilter?.addEventListener(
  "change",
  refreshFilteredTransactions
);

clearFiltersBtn?.addEventListener("click", () => {
  if (categoryFilter) categoryFilter.value = "";
  if (startDateFilter) startDateFilter.value = "";
  if (endDateFilter) endDateFilter.value = "";

  refreshFilteredTransactions();
  showToast("Filtros limpos com sucesso!");
});

// =========================================
// ATUALIZAÇÃO DO DASHBOARD
// =========================================

async function refreshDashboard() {
  if (!monthFilter) return;

  const requestNumber = ++dashboardRequest;
  const selectedMonth = monthFilter.value;

  try {
    const [transactions, summary] = await Promise.all([
      api("/api/transactions"),
      api(`/api/summary?month=${encodeURIComponent(selectedMonth)}`)
    ]);

    // Ignora respostas antigas caso o usuário troque de mês rapidamente.
    if (requestNumber !== dashboardRequest) return;

    allTransactions = Array.isArray(transactions)
      ? transactions
      : [];

    renderSummary(summary);
    refreshFilteredTransactions();
    renderCharts(summary);
  } catch (error) {
    if (requestNumber === dashboardRequest) {
      showToast(error.message);
    }
  }
}

// =========================================
// FILTRAGEM DAS TRANSAÇÕES
// =========================================

function refreshFilteredTransactions() {
  let filtered = [...allTransactions];

  const category = categoryFilter?.value || "";
  const start = startDateFilter?.value || "";
  const end = endDateFilter?.value || "";
  const selectedMonth = monthFilter?.value || "";

  if (start && end && start > end) {
    showToast(
      "A data inicial não pode ser posterior à data final."
    );

    if (startDateFilter) startDateFilter.value = "";
    if (endDateFilter) endDateFilter.value = "";

    return refreshFilteredTransactions();
  }

  if (!start && !end) {
    filtered = filtered.filter(transaction =>
      String(transaction.transaction_date || "")
        .startsWith(selectedMonth)
    );
  } else {
    if (start) {
      filtered = filtered.filter(transaction =>
        transaction.transaction_date >= start
      );
    }

    if (end) {
      filtered = filtered.filter(transaction =>
        transaction.transaction_date <= end
      );
    }
  }

  if (category) {
    filtered = filtered.filter(transaction =>
      transaction.category === category
    );
  }

  // Mantém a lista filtrada completa para a exportação.
  visibleTransactions = filtered;

  renderTransactions(filtered);
}

// =========================================
// RESUMO FINANCEIRO
// =========================================

function renderSummary(summary) {
  byId("balanceValue").textContent =
    money(summary.balance);

  byId("incomeValue").textContent =
    money(summary.income);

  byId("expensesValue").textContent =
    money(summary.expenses);

  byId("forecastValue").textContent =
    money(summary.forecast);

  byId("forecastNote").textContent =
    summary.forecast_months_used
      ? `Média de ${summary.forecast_months_used} mês(es) com registros`
      : "Adicione dados para estimar";
}

// =========================================
// TABELA DE TRANSAÇÕES
// =========================================

function renderTransactions(transactions) {
  if (!transactionsBody) return;

  transactionsBody.innerHTML = "";

  const transactionCount = byId("transactionCount");

  if (transactionCount) {
    transactionCount.textContent =
      `${transactions.length} ${
        transactions.length === 1 ? "registro" : "registros"
      }`;
  }

  if (emptyState) {
    emptyState.style.display =
      transactions.length ? "none" : "block";
  }

  const tableScroll = $(".table-scroll");

  if (tableScroll) {
    tableScroll.style.display =
      transactions.length ? "block" : "none";
  }

  // Ordena as mais recentes primeiro.
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateComparison = String(b.transaction_date || "")
      .localeCompare(String(a.transaction_date || ""));

    if (dateComparison !== 0) return dateComparison;

    return Number(b.id || 0) - Number(a.id || 0);
  });

  sortedTransactions.slice(0, 20).forEach(transaction => {
    const row = document.createElement("tr");
    const isIncome = transaction.kind === "income";

    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = transaction.description || "";

    const categoryCell = document.createElement("td");
    categoryCell.textContent = transaction.category || "";

    const dateCell = document.createElement("td");
    dateCell.textContent = dateLabel(transaction.transaction_date);

    const typeCell = document.createElement("td");
    const typePill = document.createElement("span");

    typePill.className =
      `type-pill ${isIncome ? "income" : "expense"}`;

    typePill.textContent = isIncome ? "Receita" : "Despesa";
    typeCell.appendChild(typePill);

    const amountCell = document.createElement("td");

    amountCell.className =
      isIncome ? "amount-income" : "amount-expense";

    amountCell.textContent =
      `${isIncome ? "+" : "−"} ${money(transaction.amount)}`;

    const actionsCell = document.createElement("td");
    const deleteButton = document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.dataset.id = transaction.id;
    deleteButton.setAttribute("aria-label", "Excluir transação");
    deleteButton.title = "Excluir";
    deleteButton.textContent = "×";

    actionsCell.appendChild(deleteButton);

    row.append(
      descriptionCell,
      categoryCell,
      dateCell,
      typeCell,
      amountCell,
      actionsCell
    );

    transactionsBody.appendChild(row);
  });
}

// =========================================
// EXCLUSÃO DE TRANSAÇÕES
// =========================================

transactionsBody?.addEventListener("click", async event => {
  const button = event.target.closest("button[data-id]");

  if (!button) return;

  const confirmed = confirm(
    "Deseja realmente excluir esta transação?"
  );

  if (!confirmed) return;

  button.disabled = true;

  try {
    await api(`/api/transactions/${button.dataset.id}`, {
      method: "DELETE"
    });

    showToast("Transação excluída com sucesso!");
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

// =========================================
// GRÁFICOS — TEMA ESCURO
// =========================================

function renderCharts(summary) {
  if (typeof Chart === "undefined") {
    showToast("Não foi possível carregar os gráficos.");
    return;
  }

  const categoryLabels = Object.keys(summary.categories || {});
  const categoryValues = Object.values(summary.categories || {});

  const textColor = "#a7aec2";
  const gridColor = "rgba(148, 163, 184, 0.12)";

  if (chartEmpty) {
    chartEmpty.style.display =
      categoryLabels.length ? "none" : "flex";
  }

  // GRÁFICO DE ROSCA
  if (categoryChart) categoryChart.destroy();

  categoryChart = new Chart(byId("categoryChart"), {
    type: "doughnut",

    data: {
      labels: categoryLabels,

      datasets: [{
        data: categoryValues,

        backgroundColor: [
          "#8b5cf6",
          "#34d399",
          "#fbbf24",
          "#fb7185",
          "#38bdf8",
          "#c084fc",
          "#2dd4bf",
          "#fb923c",
          "#94a3b8"
        ],

        borderColor: "#141827",
        borderWidth: 4,
        hoverOffset: 8,
        borderRadius: 4,
        spacing: 2
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",

      animation: {
        duration: 700
      },

      plugins: {
        legend: {
          position: "right",

          labels: {
            color: textColor,
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            boxHeight: 8,
            padding: 16,

            font: {
              family: "DM Sans",
              size: 11
            }
          }
        },

        tooltip: {
          backgroundColor: "#1b2032",
          titleColor: "#f3f4f6",
          bodyColor: "#d1d5db",
          borderColor: "rgba(148, 163, 184, 0.2)",
          borderWidth: 1,
          padding: 12,

          callbacks: {
            label: context =>
              ` ${context.label}: ${money(context.raw)}`
          }
        }
      }
    }
  });

  // GRÁFICO DE BARRAS
  if (monthlyChart) monthlyChart.destroy();

  monthlyChart = new Chart(byId("monthlyChart"), {
    type: "bar",

    data: {
      labels: ["Receitas", "Despesas"],

      datasets: [{
        label: "Valor",

        data: [
          Number(summary.income || 0),
          Number(summary.expenses || 0)
        ],

        backgroundColor: [
          "rgba(52, 211, 153, 0.85)",
          "rgba(139, 92, 246, 0.85)"
        ],

        hoverBackgroundColor: [
          "#34d399",
          "#a78bfa"
        ],

        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 58
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      animation: {
        duration: 700
      },

      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          backgroundColor: "#1b2032",
          titleColor: "#f3f4f6",
          bodyColor: "#d1d5db",
          borderColor: "rgba(148, 163, 184, 0.2)",
          borderWidth: 1,
          padding: 12,

          callbacks: {
            label: context => ` ${money(context.raw)}`
          }
        }
      },

      scales: {
        x: {
          grid: {
            display: false
          },

          ticks: {
            color: textColor,

            font: {
              family: "DM Sans",
              size: 12
            }
          },

          border: {
            display: false
          }
        },

        y: {
          beginAtZero: true,

          grid: {
            color: gridColor,
            drawTicks: false
          },

          ticks: {
            color: textColor,
            padding: 10,
            maxTicksLimit: 6,

            callback: value =>
              new Intl.NumberFormat("pt-BR", {
                notation: "compact",
                maximumFractionDigits: 1
              }).format(value),

            font: {
              family: "DM Sans",
              size: 10
            }
          },

          border: {
            display: false
          }
        }
      }
    }
  });
}

// =========================================
// CADASTRO DE TRANSAÇÕES
// =========================================

form?.addEventListener("submit", async event => {
  event.preventDefault();

  formError.textContent = "";

  const data = Object.fromEntries(
    new FormData(form).entries()
  );

  data.amount = Number(data.amount);

  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    formError.textContent = "Informe um valor maior que zero.";
    return;
  }

  try {
    await api("/api/transactions", {
      method: "POST",
      body: JSON.stringify(data)
    });

    monthFilter.value = data.transaction_date.slice(0, 7);

    categoryFilter.value = "";
    startDateFilter.value = "";
    endDateFilter.value = "";

    closeDialog();
    form.reset();

    byId("transactionDate").value = localDate;

    showToast("Transação cadastrada com sucesso!");

    await refreshDashboard();
  } catch (error) {
    formError.textContent = error.message;
  }
});

// =========================================
// EXPORTAÇÃO CSV
// =========================================

function getExportRows() {
  return visibleTransactions.map(transaction => ({
    "Descrição": transaction.description,
    "Valor": Number(transaction.amount),
    "Tipo": transaction.kind === "income" ? "Receita" : "Despesa",
    "Categoria": transaction.category,
    "Data": dateLabel(transaction.transaction_date)
  }));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

exportCsvBtn?.addEventListener("click", () => {
  const rows = getExportRows();

  const headers = [
    "Descrição",
    "Valor",
    "Tipo",
    "Categoria",
    "Data"
  ];

  const escapeCsv = value =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csvContent = [
    headers.map(escapeCsv).join(";"),

    ...rows.map(row =>
      headers.map(header => escapeCsv(row[header])).join(";")
    )
  ].join("\r\n");

  const blob = new Blob(
    ["\uFEFF", csvContent],
    { type: "text/csv;charset=utf-8;" }
  );

  downloadBlob(blob, "fintrack_transacoes.csv");

  showToast(
    rows.length
      ? "Arquivo CSV exportado com sucesso!"
      : "Não há transações para exportar com os filtros atuais."
  );
});

// =========================================
// EXPORTAÇÃO EXCEL
// =========================================

exportExcelBtn?.addEventListener("click", () => {
  if (typeof XLSX === "undefined") {
    showToast("Não foi possível carregar a biblioteca do Excel.");
    return;
  }

  const rows = getExportRows();

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      "Descrição",
      "Valor",
      "Tipo",
      "Categoria",
      "Data"
    ]
  });

  worksheet["!cols"] = [
    { wch: 30 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 }
  ];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Transações"
  );

  XLSX.writeFile(
    workbook,
    "fintrack_transacoes.xlsx"
  );

  showToast(
    rows.length
      ? "Arquivo Excel exportado com sucesso!"
      : "Não há transações para exportar com os filtros atuais."
  );
});

// =========================================
// METAS FINANCEIRAS
// =========================================

const goalsList = byId("goalsList");
const goalsEmpty = byId("goalsEmpty");

const goalDialog = byId("goalDialog");
const goalForm = byId("goalForm");
const goalTitle = byId("goalTitle");
const goalTarget = byId("goalTarget");
const goalSaved = byId("goalSaved");
const goalDeadline = byId("goalDeadline");
const goalError = byId("goalError");

const openGoalButton = byId("newGoalBtn");
const closeGoalButton = byId("closeGoalDialog");
const cancelGoalButton = byId("cancelGoalDialog");

const updateGoalDialog = byId("updateGoalDialog");
const updateGoalForm = byId("updateGoalForm");
const updateGoalDescription = byId("updateGoalDescription");
const updateGoalSaved = byId("updateGoalSaved");
const updateGoalError = byId("updateGoalError");

const cancelUpdateGoalButton = byId("cancelUpdateGoal");
const closeUpdateGoalButton = byId("closeUpdateGoal");

let financialGoals = [];
let selectedGoalId = null;

function formatGoalMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function setGoalError(element, message) {
  if (!element) {
    showToast(message);
    return;
  }

  element.textContent = message;
  element.hidden = false;
}

function clearGoalError(element) {
  if (!element) return;

  element.textContent = "";
  element.hidden = true;
}

// CARREGA METAS
async function loadGoals() {
  if (!goalsList) return;

  try {
    const result = await api("/api/goals");

    financialGoals = Array.isArray(result) ? result : [];

    renderGoals();
  } catch (error) {
    console.error("Erro ao carregar metas:", error);

    goalsList.innerHTML =
      '<p class="goal-empty">Não foi possível carregar suas metas. Tente novamente.</p>';

    if (goalsEmpty) goalsEmpty.hidden = true;

    showToast(error.message);
  }
}

// EXIBE METAS
function renderGoals() {
  if (!goalsList) return;

  if (!financialGoals.length) {
    goalsList.innerHTML = "";

    if (goalsEmpty) {
      goalsEmpty.hidden = false;
    }

    return;
  }

  if (goalsEmpty) goalsEmpty.hidden = true;

  goalsList.innerHTML = financialGoals.map(goal => {
    const target = Number(goal.target) || 0;
    const saved = Number(goal.saved) || 0;

    const percentage = target > 0
      ? Math.min((saved / target) * 100, 100)
      : 0;

    const completed = target > 0 && saved >= target;

    let deadlineText = "Sem prazo definido";

    if (goal.deadline) {
      deadlineText = `Prazo: ${dateLabel(goal.deadline)}`;
    }

    return `
      <article class="goal-card" data-goal-id="${goal.id}">
        <div class="goal-card-header">
          <h3>${escapeHtml(goal.title)}</h3>

          <button
            type="button"
            class="delete-goal-btn"
            data-action="delete"
            data-id="${goal.id}"
            aria-label="Excluir meta ${escapeHtml(goal.title)}"
            title="Excluir meta"
          >×</button>
        </div>

        <div class="goal-amounts">
          <span>
            Guardado: <strong>${formatGoalMoney(saved)}</strong>
          </span>

          <span>
            Objetivo: <strong>${formatGoalMoney(target)}</strong>
          </span>
        </div>

        <div
          class="goal-progress"
          role="progressbar"
          aria-label="Progresso de ${escapeHtml(goal.title)}"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${Math.round(percentage)}"
        >
          <div
            class="goal-progress-fill"
            style="width: ${percentage}%"
          ></div>
        </div>

        <div class="goal-progress-info">
          <span>${Math.round(percentage)}% concluído</span>
          <span>${escapeHtml(deadlineText)}</span>
        </div>

        <div class="goal-card-actions">
          <button
            type="button"
            class="update-goal-btn"
            data-action="update"
            data-id="${goal.id}"
          >Atualizar valor</button>

          ${
            completed
              ? '<span class="goal-completed">Meta alcançada!</span>'
              : ""
          }
        </div>
      </article>
    `;
  }).join("");
}

// ABRIR E FECHAR CADASTRO DE META
function openGoalForm() {
  if (!goalDialog || !goalForm) return;

  clearGoalError(goalError);
  goalForm.reset();

  if (goalSaved) goalSaved.value = "0";

  goalDialog.showModal();
}

function closeGoalForm() {
  if (goalDialog?.open) goalDialog.close();

  clearGoalError(goalError);
}

openGoalButton?.addEventListener("click", openGoalForm);
closeGoalButton?.addEventListener("click", closeGoalForm);
cancelGoalButton?.addEventListener("click", closeGoalForm);

// CADASTRAR META
goalForm?.addEventListener("submit", async event => {
  event.preventDefault();

  clearGoalError(goalError);

  const title = goalTitle.value.trim();
  const target = Number(goalTarget.value);
  const saved = Number(goalSaved.value || 0);
  const deadline = goalDeadline.value;

  if (!title) {
    setGoalError(goalError, "Digite um nome para sua meta.");
    return;
  }

  if (!Number.isFinite(target) || target <= 0) {
    setGoalError(goalError, "O valor da meta deve ser maior que zero.");
    return;
  }

  if (!Number.isFinite(saved) || saved < 0) {
    setGoalError(goalError, "O valor guardado não pode ser negativo.");
    return;
  }

  if (saved > target) {
    setGoalError(
      goalError,
      "O valor guardado não pode ser maior que a meta."
    );
    return;
  }

  const submitButton =
    goalForm.querySelector('button[type="submit"]');

  if (submitButton) submitButton.disabled = true;

  try {
    await api("/api/goals", {
      method: "POST",
      body: JSON.stringify({
        title,
        target,
        saved,
        deadline: deadline || null
      })
    });

    closeGoalForm();

    await loadGoals();

    showToast("Meta cadastrada com sucesso!");
  } catch (error) {
    setGoalError(goalError, error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// ATUALIZAÇÃO DE META
function openUpdateGoalForm(goal) {
  if (!updateGoalDialog || !updateGoalForm || !updateGoalSaved) {
    showToast("Não foi encontrada a janela de atualização no HTML.");
    return;
  }

  selectedGoalId = goal.id;

  clearGoalError(updateGoalError);
  updateGoalForm.reset();

  updateGoalDescription.textContent =
    `${goal.title} — objetivo: ${formatGoalMoney(goal.target)}`;

  updateGoalSaved.value = Number(goal.saved) || 0;

  updateGoalDialog.showModal();
}

function closeUpdateGoalForm() {
  if (updateGoalDialog?.open) {
    updateGoalDialog.close();
  }

  selectedGoalId = null;

  clearGoalError(updateGoalError);
}

closeUpdateGoalButton?.addEventListener(
  "click",
  closeUpdateGoalForm
);

cancelUpdateGoalButton?.addEventListener(
  "click",
  closeUpdateGoalForm
);

// SALVAR VALOR GUARDADO
updateGoalForm?.addEventListener("submit", async event => {
  event.preventDefault();

  clearGoalError(updateGoalError);

  if (selectedGoalId === null) {
    setGoalError(
      updateGoalError,
      "Selecione uma meta para atualizar."
    );
    return;
  }

  const savedText = updateGoalSaved.value.trim();
  const saved = Number(savedText.replace(",", "."));

  if (
    savedText === "" ||
    !Number.isFinite(saved) ||
    saved < 0
  ) {
    setGoalError(
      updateGoalError,
      "Digite um valor válido, igual ou maior que zero."
    );
    return;
  }

  const submitButton =
    updateGoalForm.querySelector('button[type="submit"]');

  if (submitButton) submitButton.disabled = true;

  try {
    await api(`/api/goals/${selectedGoalId}`, {
      method: "PATCH",
      body: JSON.stringify({ saved })
    });

    closeUpdateGoalForm();

    await loadGoals();

    showToast("Valor da meta atualizado com sucesso!");
  } catch (error) {
    setGoalError(updateGoalError, error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// AÇÕES DAS METAS
goalsList?.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");

  if (!button) return;

  const goalId = button.dataset.id;
  const action = button.dataset.action;

  const goal = financialGoals.find(item =>
    String(item.id) === String(goalId)
  );

  if (!goal) return;

  if (action === "update") {
    openUpdateGoalForm(goal);
    return;
  }

  if (action === "delete") {
    const confirmed = confirm(
      `Deseja realmente excluir a meta "${goal.title}"?`
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
      await api(`/api/goals/${goalId}`, {
        method: "DELETE"
      });

      await loadGoals();

      showToast("Meta excluída com sucesso!");
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  }
});

async function loadUser() {
  try {
    const response = await fetch("/api/me");

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      throw new Error("Não foi possível carregar o usuário.");
    }

    const user = await response.json();
    document.getElementById("userName").textContent = user.name;
  } catch (error) {
    console.error("Erro ao carregar usuário:", error);
  }
}

loadUser();
refreshDashboard();
loadGoals();