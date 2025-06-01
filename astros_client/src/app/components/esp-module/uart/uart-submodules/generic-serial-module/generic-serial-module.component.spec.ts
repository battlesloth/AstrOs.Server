import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenericSerialModuleComponent } from './generic-serial-module.component';

describe('GenericSerialModuleComponent', () => {
  let component: GenericSerialModuleComponent;
  let fixture: ComponentFixture<GenericSerialModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenericSerialModuleComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GenericSerialModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
