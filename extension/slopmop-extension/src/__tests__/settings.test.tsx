import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock webextension-polyfill before importing Popup
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

import Popup from '@pages/popup/Popup';

describe('Popup Settings Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render settings view when settings button is clicked', async () => {
    const user = userEvent.setup();
    render(<Popup />);

    // Find and click the settings button
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check that the settings header is rendered
    const settingsHeader = screen.getByText('Settings');
    expect(settingsHeader).toBeInTheDocument();
  });
  
  it('should render all settings sections', async () => {
    const user = userEvent.setup();
    render(<Popup />);

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for section headers
    expect(screen.getByText(/Detection/i)).toBeInTheDocument();
    expect(screen.getByText(/Platforms/i)).toBeInTheDocument();
    expect(screen.getByText(/Data/i)).toBeInTheDocument();
  });

  it('should render notification toggle in settings', async () => {
    const user = userEvent.setup();
    render(<Popup />);

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for Show Notifications toggle
    expect(screen.getByText('Show Notifications')).toBeInTheDocument();
    expect(screen.getByText('Alert when AI content is detected')).toBeInTheDocument();
  });

  it('should render sensitivity options', async () => {
    const user = userEvent.setup();
    render(<Popup />);

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for Sensitivity options
    expect(screen.getByText('Sensitivity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /low/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /medium/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /high/i })).toBeInTheDocument();
  });

  it('should render highlight style options', async () => {
    const user = userEvent.setup();
    render(<Popup />);

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for Highlight Style options
    expect(screen.getByText('Highlight Style')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /badge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /border/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dim/i })).toBeInTheDocument();
  });

  it('should render platform toggles', async () => {
    const user = userEvent.setup();
    render(<Popup />);

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for platform toggles
    expect(screen.getByText('Twitter')).toBeInTheDocument();
    expect(screen.getByText('Reddit')).toBeInTheDocument();
    expect(screen.getByText('Facebook')).toBeInTheDocument();
    expect(screen.getByText('Youtube')).toBeInTheDocument();
    expect(screen.getByText('Linkedin')).toBeInTheDocument();
  });

  it('should render reset buttons in data section', async () => {
    const user = userEvent.setup();
    render(<Popup />);

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check for reset buttons
    expect(screen.getByRole('button', { name: /Reset Stats/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset All/i })).toBeInTheDocument();
  });

  it('should navigate back to home view when back button is clicked', async () => {
    const user = userEvent.setup();
    render(<Popup />);

    // Navigate to settings
    const settingsButton = screen.getByLabelText('Settings');
    await user.click(settingsButton);

    // Check that we're in settings view
    expect(screen.getByText('Settings')).toBeInTheDocument();

    // Click back button
    const backButton = screen.getByLabelText('Back');
    await user.click(backButton);

    // Should be back to home with SlopMop title
    expect(screen.getByText('SlopMop')).toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });
});
