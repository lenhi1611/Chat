import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { HomePage } from './home-page';

describe('HomePage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows the api-gateway health status', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    TestBed.inject(HttpTestingController)
      .expectOne(`${environment.apiBaseUrl}/health`)
      .flush({ status: 'ok' });
    await fixture.whenStable();

    const card = fixture.nativeElement.querySelector(
      '[data-testid="api-health"]',
    ) as HTMLElement;
    expect(card.textContent).toContain('{"status":"ok"}');
  });

  it('shows a friendly message when the api is unreachable', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    TestBed.inject(HttpTestingController)
      .expectOne(`${environment.apiBaseUrl}/health`)
      .error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Unreachable');
  });
});
