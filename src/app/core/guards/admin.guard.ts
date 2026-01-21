import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AdminService } from '../services/admin.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const adminService = inject(AdminService);
  const router = inject(Router);

  return adminService.isAdmin().pipe(
    take(1),
    map(isAdmin => {
      if (!isAdmin) {
        console.warn('Access denied: User is not an admin');
        router.navigate(['/']);
        return false;
      }
      return true;
    })
  );
};
