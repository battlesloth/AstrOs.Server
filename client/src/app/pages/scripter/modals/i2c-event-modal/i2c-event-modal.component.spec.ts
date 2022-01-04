import { ComponentFixture, TestBed } from '@angular/core/testing';

import { I2cEventModalComponent } from './i2c-event-modal.component';

describe('I2cEventModalComponent', () => {
  let component: I2cEventModalComponent;
  let fixture: ComponentFixture<I2cEventModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ I2cEventModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(I2cEventModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
