# API Documentation

Base URL: `http://localhost:5000/api`

## Endpoints
### Manual Upload
- **POST** `/manual-upload`
- Uploads PDF/Docs → triggers Textract + Comprehend parsing.

### Auto Fetch
- **GET** `/auto-fetch`
- Pulls invoices, bills, payroll from QuickBooks/Xero via API.

### Job Status
- **GET** `/jobs/:id/status`
- Returns parsing progress + normalized JSON.

## Future
- `/pricing/market` → fetch LME/CME material prices
- `/ml/train` → retrain company-specific cost model
