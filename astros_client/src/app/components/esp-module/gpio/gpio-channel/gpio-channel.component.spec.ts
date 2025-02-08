import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GpioChannelComponent } from './gpio-channel.component';

describe('GpioChannelComponent', () => {
  let component: GpioChannelComponent;
  let fixture: ComponentFixture<GpioChannelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GpioChannelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GpioChannelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
