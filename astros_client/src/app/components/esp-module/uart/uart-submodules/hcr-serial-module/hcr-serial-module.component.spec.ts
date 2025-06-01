import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HcrSerialModuleComponent } from './hcr-serial-module.component';

describe('HcrSerialModuleComponent', () => {
  let component: HcrSerialModuleComponent;
  let fixture: ComponentFixture<HcrSerialModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HcrSerialModuleComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HcrSerialModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
