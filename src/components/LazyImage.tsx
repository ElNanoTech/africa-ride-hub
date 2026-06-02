import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  aspectRatio?: 'square' | 'video' | 'auto';
}

export function LazyImage({ 
  src, 
  alt, 
  className, 
  fallback,
  aspectRatio = 'auto' 
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, []);

  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    auto: '',
  };

  if (hasError && fallback) {
    return <>{fallback}</>;
  }

  return (
    <div 
      ref={imgRef}
      className={cn(
        'relative overflow-hidden',
        aspectClasses[aspectRatio],
        className
      )}
    >
      {!isLoaded && (
        <Skeleton className="absolute inset-0" />
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </div>
  );
}
