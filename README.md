# FinTrack — Dashboard de Finanças Pessoais

Aplicação web full stack para registrar receitas e despesas, acompanhar o saldo mensal, visualizar gráficos e consultar uma estimativa de gastos futuros.

## Tecnologias

**Front-end**

<p align="left">
  <a href="https://developer.mozilla.org/pt-BR/docs/Web/HTML">
    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/html5/html5-original.svg" width="75" height="75" alt="HTML5" />
  </a>
  <a href="https://developer.mozilla.org/pt-BR/docs/Web/CSS">
    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/css3/css3-original.svg" width="75" height="75" alt="CSS3" />
  </a>
  <a href="https://developer.mozilla.org/pt-BR/docs/Web/JavaScript">
    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg" width="75" height="75" alt="JavaScript" />
  </a>
  <a href="https://www.chartjs.org/">
    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/chartjs/chartjs-original.svg" width="75" height="75" alt="Chart.js" />
  </a>
</p>

**Back-end**

<p align="left">
  <a href="https://www.python.org/">
    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg" width="75" height="75" alt="Python" />
  </a>
  <a href="https://flask.palletsprojects.com/">
    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/flask/flask-original.svg" width="75" height="75" alt="Flask" />
  </a>
  <a href="https://www.sqlite.org/">
    <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/sqlite/sqlite-original.svg" width="75" height="75" alt="SQLite" />
  </a>
</p>

**Descrição das tecnologias**

- **HTML5:** estrutura da interface.
- **CSS3:** estilização e responsividade.
- **JavaScript:** interatividade e comunicação com a API.
- **Chart.js:** criação de gráficos interativos.
- **Python:** lógica de negócio e processamento de dados.
- **Flask:** servidor e endpoints da API.
- **SQLite:** armazenamento das transações.

## Funcionalidades

- Cadastro de receitas e despesas
- Validação dos campos no front-end e back-end
- Exclusão de transações
- Filtro por mês
- Resumo de receitas, despesas e saldo
- Gráfico de despesas por categoria
- Estimativa de gastos baseada na média dos meses anteriores com registros

> A estimativa é simples e educativa: não é aconselhamento financeiro nem uma previsão garantida. Para ter uma estimativa útil, cadastre dados de mais de um mês.

## Como executar

É necessário ter Python 3 instalado.

1. Baixe ou clone este repositório.
2. Abra a pasta do projeto no terminal.
3. Crie um ambiente virtual:

   **Windows**
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```

   **macOS/Linux**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

4. Instale as dependências:

   ```bash
   pip install -r requirements.txt
   ```

5. Inicie a aplicação:

   ```bash
   python app.py
   ```

6. Abra `http://127.0.0.1:5000` no navegador.

O banco `fintrack.db` será criado automaticamente na primeira execução. Os dados ficam no computador em que o servidor está rodando.

## Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/transactions` | Lista as transações |
| POST | `/api/transactions` | Cadastra uma transação |
| DELETE | `/api/transactions/<id>` | Exclui uma transação |
| GET | `/api/summary?month=AAAA-MM` | Retorna o resumo do mês |

### Exemplo de JSON para cadastrar uma transação

```json
{
  "description": "Mercado",
  "amount": 85.5,
  "kind": "expense",
  "category": "Alimentação",
  "transaction_date": "2026-10-13"
}
```

## Estrutura de pastas

```text
fintrack/
├── app.py
├── requirements.txt
├── README.md
├── .gitignore
├── templates/
│   └── index.html
└── static/
    ├── style.css
    └── script.js
```

## Próximas melhorias

- Login e contas separadas por usuário
- Filtros por categoria e período
- Exportação CSV/Excel
- Metas de economia
- Testes automatizados para a API
- Previsões com mais dados e comparação de meses

## Observação

Este projeto é uma demonstração educacional. Não insira informações bancárias reais ou dados pessoais sensíveis.
