# Tech Stack

Tape Measure AI is built using a hybrid ML + agentic architecture optimized for document parsing and cost estimation.

---

## Core Technologies

### **Frontend**
- React (Vite)
- TailwindCSS
- Axios for backend communication
- State: Context / Zustand (if used)

### **Backend**
- Node.js (Express)
- Python microservices for parsing (optional)
- Docker + Docker Compose

### **AI / ML**
- AWS Textract (OCR + table extraction)
- OpenAI GPT-4.1 / 4.1-mini / Sonnet for:
  - adjudication
  - normalization
  - estimation deltas
  - agent loop reasoning
- Donut (OCR-free transformer)
- LayoutLMv3 (layout-aware document understanding)
- Custom ML models (PyTorch) for:
  - material cost prediction
  - labor duration prediction
- Reducto (extraction)
- SageMaker (future training pipeline)

### **Agent Framework**
- Custom-built orchestration layer
- Tools: parser_tool, estimator_tool, export_tool
- Tasks with retries, guardrails, evaluation

### **Database**
- PostgreSQL (Neon or RDS)
- Prisma (if using Node ORM) or SQLAlchemy (if Python)

### **Cloud**
- AWS (Textract, S3, Lambda future)
- Netlify/Vercel (optional frontend hosting)

### **Infrastructure**
- Docker / Docker Compose
- GitHub Actions (CI/CD future)

### **Integrations**
- QuickBooks (OAuth2)
- Xero (OAuth2)


---

## Development Tools
- VSCode
- Postman / Insomnia
- GitHub Projects for roadmap
- OpenAI Assistants for validation

