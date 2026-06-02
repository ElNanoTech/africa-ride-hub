import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, X, Users, Car, FileText, Wallet, 
  MessageSquare, Upload 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: string;
}

export function AdminFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const haptic = useHapticFeedback();

  const actions: QuickAction[] = [
    {
      icon: <Users className="h-5 w-5" />,
      label: 'Importer conducteurs',
      onClick: () => navigate('/admin/drivers'),
      color: 'bg-blue-500',
    },
    {
      icon: <Car className="h-5 w-5" />,
      label: 'Ajouter véhicule',
      onClick: () => navigate('/admin/vehicles'),
      color: 'bg-green-500',
    },
    {
      icon: <FileText className="h-5 w-5" />,
      label: 'Locations en attente',
      onClick: () => navigate('/admin/rentals?filter=pending'),
      color: 'bg-orange-500',
    },
    {
      icon: <Wallet className="h-5 w-5" />,
      label: 'Prêts en attente',
      onClick: () => navigate('/admin/loans?filter=pending'),
      color: 'bg-purple-500',
    },
    {
      icon: <MessageSquare className="h-5 w-5" />,
      label: 'Tickets ouverts',
      onClick: () => navigate('/admin/support?filter=open'),
      color: 'bg-pink-500',
    },
  ];

  const toggleMenu = () => {
    haptic.selection();
    setIsOpen(!isOpen);
  };

  const handleAction = (action: QuickAction) => {
    haptic.medium();
    setIsOpen(false);
    action.onClick();
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* FAB Container */}
      {/* B40 — Position above bottom nav with safe spacing */}
      <div className="fixed bottom-6 right-4 z-[70] flex flex-col-reverse items-end gap-3 md:bottom-6">
        {/* Action buttons */}
        <AnimatePresence>
          {isOpen && actions.map((action, index) => (
            <motion.button
              key={action.label}
              initial={{ opacity: 0, scale: 0.3, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.3, y: 20 }}
              transition={{ 
                delay: index * 0.05,
                type: 'spring',
                stiffness: 400,
                damping: 25,
              }}
              onClick={() => handleAction(action)}
              className="flex items-center gap-3 group"
            >
              {/* Label */}
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 + 0.1 }}
                className="px-3 py-1.5 bg-card rounded-lg shadow-lg text-sm font-medium text-foreground whitespace-nowrap"
              >
                {action.label}
              </motion.span>
              
              {/* Icon button */}
              <div 
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg',
                  'active:scale-95 transition-transform',
                  action.color
                )}
              >
                {action.icon}
              </div>
            </motion.button>
          ))}
        </AnimatePresence>

        {/* Main FAB */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleMenu}
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center shadow-xl',
            'transition-colors duration-200',
            isOpen 
              ? 'bg-muted text-muted-foreground' 
              : 'bg-primary text-primary-foreground'
          )}
        >
          <motion.div
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          </motion.div>
        </motion.button>
      </div>
    </>
  );
}
