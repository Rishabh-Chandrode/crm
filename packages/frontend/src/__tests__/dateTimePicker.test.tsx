import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import DateTimePicker from '../components/DateTimePicker';

describe('DateTimePicker Component', () => {
  it('renders inline with calendar grid, presets, and time controls', () => {
    const handleChange = vi.fn();
    render(
      <DateTimePicker
        inline
        value="2026-08-25T14:30"
        onChange={handleChange}
      />
    );

    // Header Month & Year
    expect(screen.getByText(/August 2026/i)).toBeInTheDocument();

    // Day of week headers
    expect(screen.getByText('Su')).toBeInTheDocument();
    expect(screen.getByText('Mo')).toBeInTheDocument();

    // Preset buttons
    expect(screen.getByRole('button', { name: /\+2 Hours/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tomorrow 9 AM/i })).toBeInTheDocument();

    // Time controls
    expect(screen.getByText('PM')).toBeInTheDocument();
    expect(screen.getByText('AM')).toBeInTheDocument();
  });

  it('changes date when a day tile is clicked', () => {
    const handleChange = vi.fn();
    render(
      <DateTimePicker
        inline
        value="2026-08-25T14:30"
        onChange={handleChange}
      />
    );

    // Click day 28
    const day28 = screen.getByRole('button', { name: '28' });
    fireEvent.click(day28);

    expect(handleChange).toHaveBeenCalledWith('2026-08-28T14:30');
  });

  it('switches AM/PM and updates hours correctly', () => {
    const handleChange = vi.fn();
    render(
      <DateTimePicker
        inline
        value="2026-08-25T14:30"
        onChange={handleChange}
      />
    );

    // Switch to AM
    const amButton = screen.getByRole('button', { name: 'AM' });
    fireEvent.click(amButton);

    expect(handleChange).toHaveBeenCalledWith('2026-08-25T02:30');
  });

  it('applies quick minute preset chips', () => {
    const handleChange = vi.fn();
    render(
      <DateTimePicker
        inline
        value="2026-08-25T14:30"
        onChange={handleChange}
      />
    );

    // Click :45
    const min45Button = screen.getByRole('button', { name: ':45' });
    fireEvent.click(min45Button);

    expect(handleChange).toHaveBeenCalledWith('2026-08-25T14:45');
  });
});
