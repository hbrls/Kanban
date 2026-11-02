"use client";

import { type ChangeEvent, type ReactNode } from "react";

export interface SelectOption {
  value: string;
  label: string | number | ReactNode;
  disabled?: boolean;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectProps
  extends Omit<
    React.SelectHTMLAttributes<HTMLSelectElement>,
    "children" | "className" | "value" | "defaultValue"
  > {
  value?: string | number | readonly string[];
  onValueChange?: (value: string) => void;
  options?: SelectOption[];
  optionGroups?: SelectOptionGroup[];
  placeholder?: string;
  className?: string;
  children?: ReactNode;
}

const baseSelectClassName =
  "border border-slate-200 dark:border-slate-600 bg-white dark:bg-[#1e2130] text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";

export function Select({
  value = "",
  onChange,
  onValueChange,
  options,
  optionGroups,
  placeholder,
  className = "",
  children,
  ...props
}: SelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    onChange?.(event);
    onValueChange?.(nextValue);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className={`${baseSelectClassName} ${className}`}
      {...props}
    >
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {optionGroups?.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((item) => (
            <option key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
            </option>
          ))}
        </optgroup>
      ))}
      {options?.map((item) => (
        <option key={item.value} value={item.value} disabled={item.disabled}>
          {item.label}
        </option>
      ))}
      {children}
    </select>
  );
}
