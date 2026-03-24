import { ActivatedRoute, Router } from '@angular/router';

export type DiaryReport = 'entries' | 'growreport' | 'co2report';

export const DEFAULT_DIARY_REPORT: DiaryReport = 'entries';
export const DEFAULT_ENTRY_CATEGORIES = ['diary'];
export const DEFAULT_GROW_CATEGORIES = ['device-configuration', 'recipe', 'diary'];

export function parseDiaryReport(value: string | null | undefined): DiaryReport {
  return value === 'growreport' || value === 'co2report' || value === 'entries' ? value : DEFAULT_DIARY_REPORT;
}

export function parseStringArrayQueryParam(value: string | null | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : undefined;
}

export function parseNumberQueryParam(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function serializeStringArrayQueryParam(values: string[] | undefined, defaultValues?: string[]): string | null {
  if (!values || values.length === 0) {
    return null;
  }

  const normalizedValues = values.filter(Boolean);
  if (normalizedValues.length === 0) {
    return null;
  }

  if (defaultValues && sameStringArray(normalizedValues, defaultValues)) {
    return null;
  }

  return normalizedValues.join(',');
}

export function serializeNumberQueryParam(value: number | undefined, defaultValue?: number): string | null {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return null;
  }

  if (defaultValue !== undefined && value === defaultValue) {
    return null;
  }

  return String(value);
}

export async function mergeDiaryQueryParams(
  router: Router,
  route: ActivatedRoute,
  updates: Record<string, string | null | undefined>,
  replaceUrl = true,
): Promise<boolean> {
  const queryParams = Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [key, value === '' ? null : value]),
  );

  return router.navigate([], {
    relativeTo: route,
    queryParams,
    queryParamsHandling: 'merge',
    replaceUrl,
  });
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}


