function extractTextFromTextract(data) {
  const blocks = data.Blocks || [];
  return blocks
    .filter((b) => b.BlockType === "LINE" && b.Text)
    .map((b) => b.Text)
    .join("\n");
}

function parseStructuredData(text) {
  const result = {
    type: null,
    vendor: null,
    total: null,
    items: [],
    date: null,
    raw: text,
  };

  const lines = text.split("\n");

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (!result.type) {
      if (lower.includes("invoice")) result.type = "invoice";
      else if (lower.includes("quote")) result.type = "quote";
      else if (lower.includes("purchase order")) result.type = "purchase_order";
      else if (lower.includes("bill")) result.type = "bill";
      else if (lower.includes("payroll")) result.type = "payroll";
    }

    if (!result.total && /total.*[\d,.]+/i.test(line)) {
      const match = line.match(/[\d,.]+/g);
      if (match) result.total = parseFloat(match[match.length - 1].replace(/,/g, ""));
    }

    if (!result.date && /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(line)) {
      result.date = line.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/)[0];
    }

    if (lower.includes("item") || lower.includes("description")) {
      result.items.push(line);
    }

    if (!result.vendor && lower.includes("from")) {
      result.vendor = line.replace(/from/i, "").trim();
    }
  }

  return result;
}

module.exports = {
  extractTextFromTextract,
  parseStructuredData,
};
