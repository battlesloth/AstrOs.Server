import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KangarooModuleComponent } from './kangaroo-module.component';

describe('KangarooModuleComponent', () => {
  let component: KangarooModuleComponent;
  let fixture: ComponentFixture<KangarooModuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [KangarooModuleComponent]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(KangarooModuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
