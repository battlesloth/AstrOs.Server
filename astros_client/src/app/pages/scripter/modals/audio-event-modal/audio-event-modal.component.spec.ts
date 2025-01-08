import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AudioEventModalComponent } from './audio-event-modal.component';

describe('AudioEventModalComponent', () => {
  let component: AudioEventModalComponent;
  let fixture: ComponentFixture<AudioEventModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [AudioEventModalComponent]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AudioEventModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
