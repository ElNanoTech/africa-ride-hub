import { Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AdminBreadcrumbProps {
  items?: BreadcrumbItem[];
}

export function AdminBreadcrumb({ items = [] }: AdminBreadcrumbProps) {
  return (
    <Breadcrumb className="mb-4 animate-fade-in">
      <BreadcrumbList>
        <BreadcrumbItem className="animate-fade-in" style={{ animationDelay: '0ms' }}>
          <BreadcrumbLink asChild className="transition-colors duration-200 hover:text-primary">
            <Link to="/admin">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {items.map((item, index) => (
          <span key={index} className="contents">
            <BreadcrumbSeparator 
              className={cn(
                "animate-fade-in transition-opacity",
              )}
              style={{ animationDelay: `${(index + 1) * 50}ms` }}
            />
            <BreadcrumbItem 
              className="animate-fade-in"
              style={{ animationDelay: `${(index + 1) * 75}ms` }}
            >
              {item.href ? (
                <BreadcrumbLink asChild className="transition-colors duration-200 hover:text-primary">
                  <Link to={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="font-medium">{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
