import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import Combobox from '../components/Combobox';

describe('Combobox Component', () => {
  const mockOptions = [
    { value: 'apple', label: 'Apple', sublabel: 'Fruit' },
    { value: 'banana', label: 'Banana', sublabel: 'Fruit' },
    { value: 'carrot', label: 'Carrot', sublabel: 'Vegetable' },
  ];

  it('renders trigger button with placeholder when no value selected', () => {
    render(
      <Combobox
        options={mockOptions}
        value=""
        onChange={vi.fn()}
        placeholder="Select food..."
      />
    );

    expect(screen.getByText('Select food...')).toBeInTheDocument();
  });

  it('renders selected option label when value matches', () => {
    render(
      <Combobox
        options={mockOptions}
        value="banana"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('opens dropdown on click, filters options by search query, and selects option', () => {
    const handleChange = vi.fn();
    render(
      <Combobox
        options={mockOptions}
        value=""
        onChange={handleChange}
        clearable={true}
      />
    );

    // Click trigger to open
    fireEvent.click(screen.getByRole('button'));

    // Search input should be visible
    const searchInput = screen.getByPlaceholderText('Type to search…');
    expect(searchInput).toBeInTheDocument();

    // Type query
    fireEvent.change(searchInput, { target: { value: 'carr' } });

    // Should only show Carrot and clear option
    expect(screen.getByText('Carrot')).toBeInTheDocument();
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();

    // Click option
    fireEvent.mouseDown(screen.getByText('Carrot'));
    expect(handleChange).toHaveBeenCalledWith('carrot');
  });

  it('handles clearing value when clearable option is clicked', () => {
    const handleChange = vi.fn();
    render(
      <Combobox
        options={mockOptions}
        value="apple"
        onChange={handleChange}
        clearable={true}
        clearLabel="None"
      />
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.mouseDown(screen.getByText('None'));
    expect(handleChange).toHaveBeenCalledWith('');
  });
});
