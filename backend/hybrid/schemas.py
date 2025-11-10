from pydantic import BaseModel, Field, conint

class Counts(BaseModel):
    """
    Minimal, stable counts object used by your pipeline and OpenAI validator.
    """
    weld_symbols_present: bool = Field(..., description="Whether any weld symbols are present.")
    weld_symbols_count: conint(ge=0) = 0
    dim_values_count: conint(ge=0) = 0
    bom_tag_count: conint(ge=0) = 0
    bom_material_count: conint(ge=0) = 0
    bom_qty_count: conint(ge=0) = 0
