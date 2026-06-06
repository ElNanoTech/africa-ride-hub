import { Car, Bike, Heart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HapticButton } from '@/components/HapticButton';
import { formatCurrency } from '@/lib/format';
import { VEHICLE } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { resolveVehicleImage } from '@/lib/vehicleImages';
import { FLEET_CATEGORIES, fleetCategoryLabel, type FleetCategory } from '@/lib/fleetCategories';

interface Vehicle {
  id: string;
  model_name: string;
  license_plate: string;
  vehicle_type?: string | null;
  fleet_group?: string | null;
  rent_per_day: number;
  status: 'available' | 'rented' | 'maintenance';
  image_url?: string | null;
}

interface VehicleCardProps {
  vehicle: Vehicle;
  onSelect?: (vehicle: Vehicle) => void;
  compact?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (vehicleId: string, isFavorite: boolean) => void;
}

export function VehicleCard({ vehicle, onSelect, compact = false, isFavorite = false, onToggleFavorite }: VehicleCardProps) {
  const haptic = useHapticFeedback();
  
  const statusVariant = {
    available: 'verified' as const,
    rented: 'pending' as const,
    maintenance: 'rejected' as const,
  };

  const statusLabel = {
    available: VEHICLE.AVAILABLE,
    rented: VEHICLE.RENTED,
    maintenance: VEHICLE.MAINTENANCE,
  };

  // B42 — Default to 'car' if vehicle_type is missing or unknown
  const safeType = (vehicle.vehicle_type === 'bike') ? 'bike' : 'car';
  const VehicleIcon = safeType === 'car' ? Car : Bike;
  const resolvedImage = resolveVehicleImage(vehicle.image_url, vehicle.model_name);

  if (compact) {
    return (
      <Card 
        interactive={!!onSelect && vehicle.status === 'available'}
        className={cn(
          'overflow-hidden',
          vehicle.status !== 'available' && 'opacity-60'
        )}
        onClick={() => onSelect && vehicle.status === 'available' && onSelect(vehicle)}
      >
        <CardContent className="p-4 flex items-center gap-4">
          <div className={cn(
            "w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden",
            !resolvedImage && safeType === 'car' && "bg-gradient-to-br from-primary/20 to-primary/5",
            !resolvedImage && safeType === 'bike' && "bg-gradient-to-br from-secondary/20 to-secondary/5"
          )}>
            {resolvedImage ? (
              <img 
                src={resolvedImage} 
                alt={vehicle.model_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <VehicleIcon className={cn(
                "h-8 w-8",
                safeType === 'car' ? "text-primary" : "text-secondary"
              )} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold truncate">{vehicle.model_name}</h3>
                <p className="text-xs text-muted-foreground">{vehicle.license_plate}</p>
              </div>
              <Badge variant={statusVariant[vehicle.status]}>
                {statusLabel[vehicle.status]}
              </Badge>
            </div>
            <p className="text-sm font-medium text-primary mt-1">
              {formatCurrency(vehicle.rent_per_day)} {VEHICLE.PER_DAY}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      interactive={!!onSelect && vehicle.status === 'available'}
      className={cn(
        'overflow-hidden',
        vehicle.status !== 'available' && 'opacity-60'
      )}
    >
      {/* Image section */}
      <div className={cn(
        "aspect-[16/9] flex items-center justify-center relative overflow-hidden",
        !resolvedImage && safeType === 'car' && "bg-gradient-to-br from-primary/20 via-primary/10 to-background",
        !resolvedImage && safeType === 'bike' && "bg-gradient-to-br from-secondary/20 via-secondary/10 to-background"
      )}>
        {/* Favorite Button */}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              haptic.selection();
              onToggleFavorite(vehicle.id, isFavorite);
            }}
            className={cn(
              "absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all",
              isFavorite 
                ? "bg-destructive text-destructive-foreground" 
                : "bg-background/80 text-muted-foreground hover:text-destructive hover:bg-background"
            )}
          >
            <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
          </button>
        )}
        
        {resolvedImage ? (
          <img 
            src={resolvedImage} 
            alt={vehicle.model_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center",
              safeType === 'car' ? "bg-primary/10" : "bg-secondary/10"
            )}>
              <VehicleIcon className={cn(
                "h-10 w-10",
                safeType === 'car' ? "text-primary" : "text-secondary"
              )} />
            </div>
            <span className={cn(
              "text-xs font-medium",
              safeType === 'car' ? "text-primary/70" : "text-secondary/70"
            )}>
              {fleetCategoryLabel(vehicle.fleet_group)}
            </span>
          </div>
        )}
      </div>
      
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold">{vehicle.model_name}</h3>
            <p className="text-xs text-muted-foreground">
              {fleetCategoryLabel(vehicle.fleet_group)} · {vehicle.license_plate}
            </p>
          </div>
          <Badge variant={statusVariant[vehicle.status]}>
            {statusLabel[vehicle.status]}
          </Badge>
        </div>
        
        <div className="space-y-1 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{VEHICLE.PER_DAY}</span>
            <span className="font-semibold">{formatCurrency(vehicle.rent_per_day)}</span>
          </div>
        </div>
        
        {onSelect && vehicle.status === 'available' && (
          <HapticButton 
            className="w-full" 
            onClick={() => onSelect(vehicle)}
            hapticType="medium"
          >
            {VEHICLE.VIEW_DETAILS}
          </HapticButton>
        )}
      </CardContent>
    </Card>
  );
}

interface VehicleFilterProps {
  value: 'all' | FleetCategory;
  onChange: (value: 'all' | FleetCategory) => void;
}

export function VehicleFilter({ value, onChange }: VehicleFilterProps) {
  const options = [
    { value: 'all' as const, label: VEHICLE.ALL },
    ...FLEET_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
  ];

  return (
    <div className="flex gap-2 p-1 bg-muted rounded-lg">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors',
            value === option.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
