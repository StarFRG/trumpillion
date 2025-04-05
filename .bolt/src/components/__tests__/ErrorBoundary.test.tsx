import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

describe('ErrorBoundary Component', () => {
  const ThrowError = () => {
    throw new Error('Test error');
  };

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Test Content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders error UI when error occurs', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/etwas ist schiefgelaufen/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Seite neu laden/i })).toBeInTheDocument();
    
    spy.mockRestore();
  });

  it('reloads page when reload button is clicked', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const reloadMock = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true
    });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: /Seite neu laden/i }));
    expect(reloadMock).toHaveBeenCalled();
    
    spy.mockRestore();
  });
});