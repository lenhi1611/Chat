import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { mergeClasses, provideZard, ZardButtonComponent } from './index';

@Component({
  imports: [ZardButtonComponent],
  template: `<button z-button zType="secondary">Hi</button>`,
})
class HostComponent {}

describe('@realtime-chat/ui public API', () => {
  it('merges Tailwind classes, last one winning', () => {
    expect(mergeClasses('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('renders a zard button with its variant classes', async () => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZard()],
    });
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    expect(button.dataset['slot']).toBe('button');
    expect(button.dataset['variant']).toBe('secondary');
    expect(button.className).toContain('bg-secondary');
  });
});
