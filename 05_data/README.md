# 05_data

**Structured operational data** the project uses to generate outputs: product
catalogs, price lists, contacts, inventories.

- Format: prefer machine-readable (`.json`, `.csv`, `.yaml`) over prose.
- This data **feeds** deliverables (they flow into `03_outputs/`) — it is not
  itself a deliverable.
- Update frequency is expected here: this is the "hot" data layer.
- Keep original sources in `02_resources/docs/` if they exist (PDFs, manuals).
