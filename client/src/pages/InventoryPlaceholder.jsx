import React from 'react';
import { Layers } from 'lucide-react';

export default function InventoryPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-2xl mx-auto space-y-3">
      <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto">
        <Layers className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-bold text-slate-800">Inventory Module</h2>
      <p className="text-xs text-slate-500">
        Product and SKU inventory tracking will be implemented in subsequent phases. Phase 1 foundation is active.
      </p>
    </div>
  );
}

