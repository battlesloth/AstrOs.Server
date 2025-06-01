import { ComponentFixture, TestBed } from '@angular/core/testing';

import { M5PaperConfigComponent } from './m5-paper-config.component';

describe('M5PaperConfigComponent', () => {
  let component: M5PaperConfigComponent;
  let fixture: ComponentFixture<M5PaperConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [M5PaperConfigComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(M5PaperConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
