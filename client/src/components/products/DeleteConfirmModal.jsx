import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  product,
  onConfirm
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !product) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm(product._id);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Product SKU?"
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            isLoading={isDeleting}
            onClick={handleConfirm}
          >
            Delete Product
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-800 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Permanent Catalog Action</p>
            <p className="text-rose-700/90 leading-relaxed">
              Are you sure you want to delete <strong className="font-semibold text-rose-950">"{product.name}"</strong>?
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          This will permanently remove the master product SKU and barcode association ({product.barcode || 'non-barcoded'}) from your supermarket catalog.
        </p>
      </div>
    </Modal>
  );
}

