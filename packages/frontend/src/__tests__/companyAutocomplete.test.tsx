import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import CompanyAutocomplete from '../components/CompanyAutocomplete';
import type { Company } from '../lib/types';

describe('CompanyAutocomplete Component', () => {
  const mockCompanies: Company[] = [
    {
      id: 'comp-1',
      name: 'Airtel',
      website: 'https://airtel.in',
      industry: 'Telecommunications',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'comp-2',
      name: 'Stripe',
      website: 'https://stripe.com',
      industry: 'Financial Services',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'comp-3',
      name: 'Google',
      website: 'https://google.com',
      industry: 'Technology',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  it('renders input with value and placeholder', () => {
    render(
      <CompanyAutocomplete
        value="Airtel"
        onChange={vi.fn()}
        companies={mockCompanies}
        placeholder="Enter company name"
      />
    );

    const input = screen.getByPlaceholderText('Enter company name') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Airtel');
  });

  it('displays Existing Company badge when typed value exactly matches an existing company', () => {
    render(
      <CompanyAutocomplete
        value="airtel"
        onChange={vi.fn()}
        companies={mockCompanies}
      />
    );

    expect(screen.getByText(/Existing Company in Companies table/i)).toBeInTheDocument();
  });

  it('displays New Company indicator badge when typed value does not match existing companies', () => {
    render(
      <CompanyAutocomplete
        value="OpenAI"
        onChange={vi.fn()}
        companies={mockCompanies}
      />
    );

    expect(screen.getByText(/New Company \(will be added to Companies table\)/i)).toBeInTheDocument();
  });

  it('shows autocomplete dropdown with matching companies and handles selecting an existing company', () => {
    const handleChange = vi.fn();
    render(
      <CompanyAutocomplete
        value="air"
        onChange={handleChange}
        companies={mockCompanies}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    // Dropdown should show Airtel
    const option = screen.getByText('Airtel');
    expect(option).toBeInTheDocument();

    // Click on the option
    fireEvent.mouseDown(option);
    expect(handleChange).toHaveBeenCalledWith('Airtel', mockCompanies[0]);
  });

  it('shows Add New Company option in dropdown when query has no exact match and selects it', () => {
    const handleChange = vi.fn();
    render(
      <CompanyAutocomplete
        value="Acme Corp"
        onChange={handleChange}
        companies={mockCompanies}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    const addOption = screen.getByRole('option');
    expect(addOption).toBeInTheDocument();
    expect(addOption).toHaveTextContent(/Add "Acme Corp" as new company/i);

    fireEvent.mouseDown(addOption);
    expect(handleChange).toHaveBeenCalledWith('Acme Corp', undefined);
  });

  it('allows clearing input with clear button', () => {
    const handleChange = vi.fn();
    render(
      <CompanyAutocomplete
        value="Stripe"
        onChange={handleChange}
        companies={mockCompanies}
      />
    );

    const clearBtn = screen.getByTitle('Clear');
    fireEvent.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith('', undefined);
  });
});
