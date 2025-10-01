# Data Models

## Example: Normalized Invoice
```json
{
  "docType": "invoice",
  "company": "ABC Welding",
  "date": "2025-08-28",
  "lineItems": [
    { "description": "A36 Plate 1/4in", "quantity": 5, "unitCost": 120.50 },
    { "description": "Labor - Welding", "hours": 10, "rate": 85 }
  ],
  "subtotal": 1645.50,
  "tax": 148.10,
  "total": 1793.60
}
