import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filterNull',
  standalone: true
})
export class FilterNullPipe implements PipeTransform {
  transform<T>(value: (T | null)[]): T[] {
    if (!value) return [];
    return value.filter((item): item is T => item !== null);
  }
}
