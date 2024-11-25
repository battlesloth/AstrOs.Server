import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GpioEventModalComponent } from './gpio-event-modal.component';

describe('I2cEventModalComponent', () => {
  let component: GpioEventModalComponent;
  let fixture: ComponentFixture<GpioEventModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GpioEventModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GpioEventModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
