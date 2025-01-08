import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UartEventModalComponent } from './uart-event-modal.component';

describe('UartEventModalComponent', () => {
  let component: UartEventModalComponent;
  let fixture: ComponentFixture<UartEventModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [UartEventModalComponent]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UartEventModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
