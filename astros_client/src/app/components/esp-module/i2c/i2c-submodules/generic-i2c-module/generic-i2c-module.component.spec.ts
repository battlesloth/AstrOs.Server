import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenericI2cModuleComponent } from './generic-i2c-module.component';

describe('GenericI2cModuleComponent', () => {
  let component: GenericI2cModuleComponent;
  let fixture: ComponentFixture<GenericI2cModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenericI2cModuleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GenericI2cModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
