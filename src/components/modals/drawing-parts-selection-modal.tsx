import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DrawingPartsSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedParts: string[]) => void;
  drawingName: string;
}

const PART_CATEGORIES = [
  {
    id: "structural_steel",
    name: "Structural Steel",
    description: "Beams, columns, angles, channels",
    examples: ["W-beams", "HSS sections", "Angles", "Channels", "Plates"],
  },
  {
    id: "sheet_metal",
    name: "Sheet Metal",
    description: "Flat sheets, bent components",
    examples: ["Steel plate", "Aluminum sheet", "Bent brackets", "Enclosures"],
  },
  {
    id: "pipe_tube",
    name: "Pipe & Tube",
    description: "Round, square, rectangular tubing",
    examples: ["Steel pipe", "Square tube", "Rectangular tube", "Conduit"],
  },
  {
    id: "hardware",
    name: "Hardware & Fasteners",
    description: "Bolts, nuts, welding symbols",
    examples: ["Bolts", "Nuts", "Washers", "Weld symbols", "Connectors"],
  },
  {
    id: "custom_parts",
    name: "Custom Fabricated Parts",
    description: "Machined or fabricated components",
    examples: ["Machined parts", "Brackets", "Gussets", "Custom assemblies"],
  },
];

export default function DrawingPartsSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  drawingName,
}: DrawingPartsSelectionModalProps) {
  const [selectedParts, setSelectedParts] = useState<string[]>([]);

  const handlePartToggle = (partId: string) => {
    setSelectedParts(prev =>
      prev.includes(partId)
        ? prev.filter(id => id !== partId)
        : [...prev, partId]
    );
  };

  const handleConfirm = () => {
    onConfirm(selectedParts);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Select Relevant Parts for Quote</DialogTitle>
          <p className="text-sm text-gray-600">
            Select which types of parts from "{drawingName}" should be included in your quote. 
            This helps the AI focus on the relevant components during analysis.
          </p>
        </DialogHeader>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {PART_CATEGORIES.map((category) => {
            const isSelected = selectedParts.includes(category.id);
            
            return (
              <Card 
                key={category.id}
                className={`cursor-pointer transition-colors ${
                  isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-gray-50"
                }`}
                onClick={() => handlePartToggle(category.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handlePartToggle(category.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Label className="text-base font-medium cursor-pointer">
                          {category.name}
                        </Label>
                        {isSelected && (
                          <Badge variant="secondary" className="text-xs">
                            Selected
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {category.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {category.examples.map((example) => (
                          <Badge key={example} variant="outline" className="text-xs">
                            {example}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <p className="text-sm text-gray-500">
            {selectedParts.length} part {selectedParts.length === 1 ? "type" : "types"} selected
          </p>
          <div className="space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={selectedParts.length === 0}>
              Continue with AI Analysis
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}