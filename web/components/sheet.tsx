'use client';
import * as Modal from '@/components/ui/modal';
import { cn } from '@/utils/cn';

/** Bottom sheet on phones, centred modal on larger screens. */
export function Sheet({ open, onOpenChange, title, children, className, dismissable = true }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode; className?: string; dismissable?: boolean;
}) {
  return (
    <Modal.Root open={open} onOpenChange={(o) => (dismissable || o ? onOpenChange(o) : undefined)}>
      <Modal.Content
        overlayClassName="justify-end p-0 sm:justify-center sm:p-4"
        className={cn('max-h-[92dvh] max-w-full overflow-y-auto rounded-b-none sm:max-w-[460px] sm:rounded-20', className)}
        showClose={dismissable}
        onInteractOutside={(e) => !dismissable && e.preventDefault()}
        onEscapeKeyDown={(e) => !dismissable && e.preventDefault()}
      >
        <Modal.Title className="px-5 pb-1 pt-5 text-title-h6">{title}</Modal.Title>
        <Modal.Description className="sr-only">{title}</Modal.Description>
        <div className="px-5 pb-6 pt-3">{children}</div>
      </Modal.Content>
    </Modal.Root>
  );
}
