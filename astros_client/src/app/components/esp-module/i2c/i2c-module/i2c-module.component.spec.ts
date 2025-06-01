import { ComponentFixture, TestBed } from '@angular/core/testing';

import { I2cModuleComponent } from './i2c-module.component';

describe('I2cModuleComponent', () => {
  let component: I2cModuleComponent;
  let fixture: ComponentFixture<I2cModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [I2cModuleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(I2cModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
