import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Se uma página quebrar, mostra um aviso com "Tentar de novo" em vez de deixar a tela em branco. */
export default class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-6 text-center">
        <p className="text-[15px] font-semibold">Algo deu errado nesta tela</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{this.state.error.message}</p>
        <Button className="mt-4" size="sm" onClick={() => this.setState({ error: null })}>Tentar de novo</Button>
      </div>
    );
  }
}
