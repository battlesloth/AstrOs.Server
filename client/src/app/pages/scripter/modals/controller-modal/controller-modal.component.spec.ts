import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ControllerModalComponent } from './controller-modal.component';

describe('ControllerModalComponent', () => {
  let component: ControllerModalComponent;
  let fixture: ComponentFixture<ControllerModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ControllerModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ControllerModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
