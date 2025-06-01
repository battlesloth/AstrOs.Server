import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddChannelModalComponent } from './add-channel-modal.component';

describe('ControllerModalComponent', () => {
  let component: AddChannelModalComponent;
  let fixture: ComponentFixture<AddChannelModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddChannelModalComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AddChannelModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
