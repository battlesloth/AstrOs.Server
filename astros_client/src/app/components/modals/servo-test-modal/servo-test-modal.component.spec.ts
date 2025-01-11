import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServoTestModalComponent } from './servo-test-modal.component';

describe('ServoTestModalComponent', () => {
  let component: ServoTestModalComponent;
  let fixture: ComponentFixture<ServoTestModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServoTestModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServoTestModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
