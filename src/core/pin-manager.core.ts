import * as vscode from 'vscode';
import type { ScopeInfo } from './scope-detector.core';

export interface PinnedScope {
  uri: vscode.Uri;
  fileName: string;
  name: string;
  startLine: number;
  endLine: number;
  nodeType: string;
  parentName?: string;
  scopes: ScopeInfo[];
}

export class ScopePinManager {
  private static instance: ScopePinManager;
  private pins: PinnedScope[] = [];
  private onDidChangePinEmitter = new vscode.EventEmitter<PinnedScope | null>();
  private onDidChangePinsEmitter = new vscode.EventEmitter<PinnedScope[]>();

  public readonly onDidChangePin = this.onDidChangePinEmitter.event;
  public readonly onDidChangePins = this.onDidChangePinsEmitter.event;

  private constructor() {}

  public static getInstance(): ScopePinManager {
    if (!ScopePinManager.instance) {
      ScopePinManager.instance = new ScopePinManager();
    }
    return ScopePinManager.instance;
  }

  public getPin(): PinnedScope | null {
    return this.pins[0] || null;
  }

  public setPin(pin: PinnedScope | null): void {
    if (pin === null) {
      this.pins = [];
    } else {
      this.pins = [pin];
    }
    this.onDidChangePinEmitter.fire(pin);
    this.onDidChangePinsEmitter.fire([...this.pins]);
  }

  public getPins(): PinnedScope[] {
    return this.pins;
  }

  public addPin(pin: PinnedScope): void {
    const exists = this.pins.some((p) => p.uri.toString() === pin.uri.toString());
    if (!exists) {
      this.pins.push(pin);
      this.onDidChangePinEmitter.fire(pin);
      this.onDidChangePinsEmitter.fire([...this.pins]);
    }
  }

  public removePin(uri: vscode.Uri): void {
    const originalLen = this.pins.length;
    this.pins = this.pins.filter((p) => p.uri.toString() !== uri.toString());
    if (this.pins.length !== originalLen) {
      this.onDidChangePinEmitter.fire(this.pins[0] || null);
      this.onDidChangePinsEmitter.fire([...this.pins]);
    }
  }

  public clearPins(): void {
    if (this.pins.length > 0) {
      this.pins = [];
      this.onDidChangePinEmitter.fire(null);
      this.onDidChangePinsEmitter.fire([]);
    }
  }
}
