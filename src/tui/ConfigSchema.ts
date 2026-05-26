/**
 * Modular config schema: define columns, detail fields, and actions once.
 * The ConfigPane list view + detail form are generated from this schema.
 */

import type { ListColumn, ListView, ListRow, ListAction, DetailField, DetailConfig } from './ConfigPane.js';

/** A field definition that serves both as a list column and a detail form field. */
export interface SchemaField {
  key: string;
  label: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  listVisible?: boolean;
  detailType: 'readonly' | 'text' | 'toggle' | 'choice' | 'action';
  choices?: { id: string; label: string }[];
  description?: string;
  defaultValue?: string | boolean;
}

/** Row-level action (shown in detail view and optionally as bulk list actions). */
export interface SchemaAction {
  key: string;
  label: string;
  danger?: boolean;
  bulk?: boolean;
}

/** Complete schema for a config list pane. */
export interface ConfigSchema {
  id: string;
  title: string;
  fields: SchemaField[];
  actions: SchemaAction[];
  rows: ListRow[];
  sortColumn?: string;
  sortAsc?: boolean;
  multiSelect?: boolean;
  defaultAction?: string;
}

/** Generate a ListView from a schema definition. */
export function schemaToListView(schema: ConfigSchema): ListView {
  const columns: ListColumn[] = schema.fields
    .filter(f => f.listVisible !== false && f.width !== undefined)
    .map(f => ({
      key: f.key,
      label: f.label,
      width: f.width!,
      align: f.align,
      sortable: f.sortable,
    }));

  return {
    columns,
    rows: schema.rows,
    sortColumn: schema.sortColumn,
    sortAsc: schema.sortAsc ?? true,
    multiSelect: schema.multiSelect ?? false,
  };
}

/** Generate list actions from a schema definition. */
export function schemaToListActions(schema: ConfigSchema): ListAction[] {
  return schema.actions
    .filter(a => a.bulk !== false)
    .map(a => ({ key: a.key, label: a.label, bulk: a.bulk }));
}

/** Generate a detail config factory from a schema definition. */
export function schemaToDetailConfig(schema: ConfigSchema): (row: ListRow) => DetailConfig {
  return (row: ListRow) => {
    const fields: DetailField[] = schema.fields.map(f => {
      const cellVal = row.cells[f.key];
      const value = f.detailType === 'toggle'
        ? (cellVal === 'on' || cellVal === 'true' ? true : cellVal === 'off' || cellVal === 'false' ? false : f.defaultValue ?? false)
        : (cellVal ?? f.defaultValue ?? '');
      return {
        key: f.key,
        label: f.label,
        type: f.detailType,
        value,
        choices: f.choices,
        description: f.description,
      };
    });

    const actions = schema.actions.map(a => ({
      key: a.key,
      label: a.label,
      danger: a.danger,
    }));

    return { fields, actions };
  };
}

/** Interface for any pane that accepts list view and detail config registrations. */
export interface SchemaTarget {
  registerListView(panelId: string, listView: ListView, actions?: ListAction[], defaultAction?: string): void;
  registerDetailConfig(panelId: string, configFn: (row: ListRow) => DetailConfig): void;
}

/** Register a full schema onto a ConfigPane in one call. */
export function registerSchema(
  pane: SchemaTarget,
  panelId: string,
  schema: ConfigSchema,
): void {
  pane.registerListView(panelId, schemaToListView(schema), schemaToListActions(schema), schema.defaultAction);
  pane.registerDetailConfig(panelId, schemaToDetailConfig(schema));
}
