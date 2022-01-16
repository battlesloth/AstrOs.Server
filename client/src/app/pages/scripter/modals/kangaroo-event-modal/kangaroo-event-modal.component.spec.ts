import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KangarooEventModalComponent } from './kangaroo-event-modal.component';

describe('KangarooEventModalComponent', () => {
  let component: KangarooEventModalComponent;
  let fixture: ComponentFixture<KangarooEventModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ KangarooEventModalComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(KangarooEventModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
