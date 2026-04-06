export type FieldType = 'string' | 'textarea' | 'number' | 'boolean' | 'date' | 'file' | 'image' | 'select';

export interface FieldOption { label: string; value: string; }

export interface FieldValidation {
  min?: number; max?: number;
  minLength?: number; maxLength?: number;
  pattern?: string;
}

export interface EntityField {
  id: string;
  entity_type_id: string;
  field_key: string;
  name: string;
  field_type: FieldType;
  required: boolean;
  default_value?: unknown;
  options?: FieldOption[];
  validation?: FieldValidation;
  order_index: number;
  is_searchable: boolean;
  is_filterable: boolean;
  show_in_list: boolean;
}

export interface EntityType {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  color: string;
  record_count: number;
  field_count?: number;
  fields?: EntityField[];
  created_at: string;
}

export interface EntityRecord {
  id: string;
  entity_type_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
