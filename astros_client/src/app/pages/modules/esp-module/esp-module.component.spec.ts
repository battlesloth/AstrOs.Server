import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EspModuleComponent } from './esp-module.component';

describe('EspModuleComponent', () => {
  let component: EspModuleComponent;
  let fixture: ComponentFixture<EspModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EspModuleComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EspModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
