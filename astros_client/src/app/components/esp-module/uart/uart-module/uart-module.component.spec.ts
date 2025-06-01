import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UartModuleComponent } from './uart-module.component';

describe('UartModuleComponent', () => {
  let component: UartModuleComponent;
  let fixture: ComponentFixture<UartModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UartModuleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UartModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
