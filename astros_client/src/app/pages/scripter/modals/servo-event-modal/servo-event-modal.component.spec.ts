import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServoEventModalComponent } from './servo-event-modal.component';

describe('ServoEventModalComponent', () => {
  let component: ServoEventModalComponent;
  let fixture: ComponentFixture<ServoEventModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ServoEventModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ServoEventModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
