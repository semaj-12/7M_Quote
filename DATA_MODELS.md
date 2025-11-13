# Data Models

This file defines the core data structures used across the pipeline.

---

# NormalizedDoc Schema

```json
{
  "documentType": "invoice | bid | blueprint | bom | unknown",
  "entities": {
    "project": {
      "name": "",
      "address": "",
      "contractor": ""
    },
    "materials": [
      {
        "description": "",
        "quantity": 0,
        "unit": "",
        "dimensions": { "length": null, "width": null, "height": null },
        "notes": ""
      }
    ],
    "labor": [
      {
        "description": "",
        "hours": null,
        "crew": "",
        "notes": ""
      }
    ]
  }
}
 
 # Estimate Model

{
  "materials": [
    {
      "item": "A36 Plate",
      "quantity": 4,
      "unit": "pcs",
      "unitCost": 54.25,
      "totalCost": 217
    }
  ],
  "labor": [
    {
      "task": "Welding",
      "hours": 5.5,
      "rate": 85,
      "totalCost": 467.5
    }
  ],
  "totals": {
    "materialCost": 217,
    "laborCost": 467.5,
    "total": 684.5
  }
}

# Agent Action Log

{
  "jobId": "uuid",
  "action": "parse | normalize | estimate | export",
  "input": {},
  "output": {},
  "success": true,
  "timestamp": "2025-01-01T00:00:00Z"
}

# Parser Selection Model 

{
  "documentType": "blueprint",
  "recommendedParser": "layoutlmv3",
  "reason": "Detected technical drawing with grid, dimensions, BOM"
}

# Customer Delta Model (estimation tuning)

{
  "customerId": "uuid",
  "materialMultiplier": 1.08,
  "laborMultiplier": 0.92,
  "updatedAt": "timestamp"
}

