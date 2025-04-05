import { render, screen } from '@testing-library/react';
import { Logo } from '../Logo';

describe('Logo Component', () => {
  it('renders correctly', () => {
    render(<Logo />);
    expect(screen.getByText('Trumpillion')).toBeInTheDocument();
  });

  it('includes the red dot', () => {
    render(<Logo />);
    const dot = screen.getByText('.');
    expect(dot).toHaveClass('text-red-500');
  });
});