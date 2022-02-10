import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PwmEventModalComponent } from './pwm-event-modal.component';

describe('PwmEventModalComponent', () => {
  let component: PwmEventModalComponent;
  let fixture: ComponentFixture<PwmEventModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PwmEventModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PwmEventModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
