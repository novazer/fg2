import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { DeviceLog } from 'src/app/services/devices.service';
import { getDiaryDataFieldUnit } from '../diary/diary-entry-modal/diary-entry-modal.component';

export type LogCategoryFilterValue = string[];

export type LogEntryViewerLog = DeviceLog & {
  count?: number;
  imageUrls?: Promise<string>[];
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
  @Input() log: LogEntryViewerLog | null = null;
  @Input() imageIdToImageUrl: Record<string, string> = {};

  @Input() showCount = false;
  @Input() showGroupingHint = false;
  @Input() showCategories = false;
  @Input() showEdit = false;
  @Input() showDelete = false;
  @Input() editable = false;

  @Input() selectedCategories: LogCategoryFilterValue = [];

  // Pagination inputs
  @Input() logs: LogEntryViewerLog[] = [];
  @Input() itemsPerPage = 100;
  @Input() showPagination = false;

  @Output() imageOpen = new EventEmitter<{ log: LogEntryViewerLog; imageIndex: number }>();
  @Output() showAll = new EventEmitter<LogEntryViewerLog>();
  @Output() edit = new EventEmitter<LogEntryViewerLog>();
  @Output() delete = new EventEmitter<LogEntryViewerLog>();

  currentPage = 1;

  private imageUrlCache = new Map<string, Promise<string>>();

  get totalPages(): number {
    return Math.ceil(this.logs.length / this.itemsPerPage);
  }

  get paginatedLogs(): LogEntryViewerLog[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.logs.slice(startIndex, endIndex);
  }

  get showPaginationControls(): boolean {
    return this.showPagination && this.totalPages > 1;
  }

  getDisplayLogs(): LogEntryViewerLog[] {
    if (this.logs.length > 0) {
      return this.paginatedLogs;
    }

    return this.log ? [this.log] : [];
  }

  resolveImageUrl(log: LogEntryViewerLog, imageId: string, index: number): Promise<string> {
    const cacheKey = `${log._id}:${imageId}:${index}`;
    const cached = this.imageUrlCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const urlPromise = log.imageUrls?.[index]
      ?? Promise.resolve(this.imageIdToImageUrl[imageId] ?? '');

    this.imageUrlCache.set(cacheKey, urlPromise);
    return urlPromise;
  }

  onImageClick(event: Event, index: number, logEntry: LogEntryViewerLog): void {
    event.preventDefault();
    this.imageOpen.emit({ log: logEntry, imageIndex: index });
  }

  onShowAll(event: Event, logEntry: LogEntryViewerLog): void {
    event.preventDefault();
    this.showAll.emit(logEntry);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedCategories'] && !changes['selectedCategories'].firstChange) {
      this.currentPage = 1;
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  previousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  protected readonly getDiaryDataFieldUnit = getDiaryDataFieldUnit;
}
