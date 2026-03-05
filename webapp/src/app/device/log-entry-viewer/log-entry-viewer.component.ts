import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {DeviceLog} from 'src/app/services/devices.service';

export const LOGS_MAX_DISPLAY_COUNT = 100;

export type LogCategoryFilterValue = string[];

export type LogEntryViewerLog = DeviceLog & {
  count?: number;
  editable?: boolean;
};

export function collectLogCategories(logs: Array<Pick<DeviceLog, 'categories'>>): string[] {
  const categories = new Set<string>();
  logs.forEach(log => log.categories?.forEach(category => categories.add(category)));
  return [...categories].sort((a, b) => a.localeCompare(b));
}

export function matchesLogCategory(log: Pick<DeviceLog, 'categories'>, selectedCategories: LogCategoryFilterValue): boolean {
  if (!selectedCategories || selectedCategories.length === 0) {
    return true;
  }

  return Boolean(log.categories?.some(cat => selectedCategories.includes(cat)));
}

export function filterLogsByCategory<T extends Pick<DeviceLog, 'categories'>>(logs: T[], selectedCategories: LogCategoryFilterValue): T[] {
  return logs.filter(log => matchesLogCategory(log, selectedCategories));
}

@Component({
  selector: 'app-log-entry-viewer',
  templateUrl: './log-entry-viewer.component.html',
  styleUrls: ['./log-entry-viewer.component.scss'],
})
export class LogEntryViewerComponent implements OnChanges {
  @Input() showCategories = false;
  @Input() showEdit = false;
  @Input() showDelete = false;
  @Input() editable = false;

  @Input() selectedCategories: LogCategoryFilterValue = [];

  @Input() logs!: LogEntryViewerLog[];

  @Output() showAll = new EventEmitter<LogEntryViewerLog>();
  @Output() edit = new EventEmitter<LogEntryViewerLog>();
  @Output() delete = new EventEmitter<LogEntryViewerLog>();

  currentPage = 1;
  totalPages = 1;
  showPaginationControls = false;
  displayLogs: LogEntryViewerLog[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedCategories'] && !changes['selectedCategories'].firstChange) {
      this.currentPage = 1;
    }
    this.updateDisplayLogs();
  }

  private updateDisplayLogs(): void {
    const filtered = filterLogsByCategory(this.logs ?? [], this.selectedCategories);
    this.totalPages = Math.ceil(filtered.length / LOGS_MAX_DISPLAY_COUNT);
    this.showPaginationControls = this.totalPages > 1;

    if (filtered.length === 0) {
      this.displayLogs = [];
      return;
    }

    const startIndex = (this.currentPage - 1) * LOGS_MAX_DISPLAY_COUNT;
    const endIndex = startIndex + LOGS_MAX_DISPLAY_COUNT;
    this.displayLogs = filtered.slice(startIndex, endIndex);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updateDisplayLogs();
    }
  }

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  previousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  trackById(index: number, entry: LogEntryViewerLog): string {
    return entry?._id ?? index.toString();
  }
}
